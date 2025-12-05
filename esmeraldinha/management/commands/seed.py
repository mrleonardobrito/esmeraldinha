from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.conf import settings
from pathlib import Path
import json
import tempfile
from django.apps import apps


class Command(BaseCommand):
    help = 'Carrega fixtures de todos os apps que possuem pasta fixtures'

    def handle(self, *args, **options):
        base_dir = Path(settings.BASE_DIR)

        self.stdout.write(
            self.style.SUCCESS('Iniciando carregamento de fixtures...')
        )

        fixtures_loaded = False
        m2m_relations = []

        dependency_order = ['schools', 'teachers', 'classes', 'gradebooks', 'academic_calendars']

        apps_with_fixtures = []
        for app_config in settings.INSTALLED_APPS:
            if not app_config.startswith('apps.'):
                continue

            app_name = app_config.split('.')[-1]
            app_path = base_dir / 'apps' / app_name
            fixtures_path = app_path / 'fixtures'

            if fixtures_path.exists():
                json_files = list(fixtures_path.glob('*.json'))
                if json_files:
                    apps_with_fixtures.append((app_name, fixtures_path, json_files))

        def get_app_order(app_tuple):
            app_name = app_tuple[0]
            try:
                return dependency_order.index(app_name)
            except ValueError:
                return len(dependency_order)

        apps_with_fixtures.sort(key=get_app_order)

        for app_name, fixtures_path, json_files in apps_with_fixtures:

            self.stdout.write(
                self.style.WARNING(f'  Carregando fixtures do app "{app_name}":')
            )

            for json_file in json_files:
                fixture_name = json_file.stem
                try:
                    self.stdout.write(f'    Carregando {fixture_name}...')

                    fixture_data, relations = self._process_fixture_file(json_file)

                    if relations:
                        m2m_relations.extend(relations)

                    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
                        json.dump(fixture_data, temp_file, indent=2)
                        temp_path = temp_file.name

                    try:
                        call_command('loaddata', temp_path, verbosity=0)
                        self.stdout.write(
                            self.style.SUCCESS(f'      ✓ {fixture_name} carregado com sucesso')
                        )
                        fixtures_loaded = True
                    finally:
                        try:
                            Path(temp_path).unlink()
                        except FileNotFoundError:
                            pass

                except Exception as e:
                    error_msg = str(e)
                    if 'model' in error_msg.lower():
                        self.stdout.write(
                            self.style.WARNING(f'      ⚠ {fixture_name} pulado (formato inválido: {error_msg[:50]}...)')
                        )
                    else:
                        self.stdout.write(
                            self.style.ERROR(f'      ✗ Erro ao carregar {fixture_name}: {error_msg}')
                        )

        if fixtures_loaded:
            self.stdout.write(
                self.style.SUCCESS('\nTodas as fixtures foram processadas!')
            )

            if m2m_relations:
                self.stdout.write(
                    self.style.WARNING('\nProcessando relacionamentos ManyToMany...')
                )
                self._process_m2m_relations(m2m_relations)
        else:
            self.stdout.write(
                self.style.WARNING('\nNenhuma fixture foi encontrada para carregar.')
            )

    def _process_fixture_file(self, json_file):
        with open(json_file, 'r', encoding='utf-8') as f:
            fixture_data = json.load(f)

        relations = []

        for item in fixture_data:
            if 'fields' in item and '_m2m_relations' in item['fields']:
                m2m_data = item['fields'].pop('_m2m_relations')

                for field_name, related_ids in m2m_data.items():
                    relations.append({
                        'model': item['model'],
                        'pk': item['pk'],
                        'field': field_name,
                        'related_ids': related_ids if isinstance(related_ids, list) else [related_ids]
                    })

        return fixture_data, relations

    def _process_m2m_relations(self, relations):
        total_linked = 0

        for relation in relations:
            try:
                model_label = relation['model']
                pk = relation['pk']
                field_name = relation['field']
                related_ids = relation['related_ids']

                model_class = apps.get_model(model_label)
                instance = model_class.objects.get(pk=pk)
                m2m_field = model_class._meta.get_field(field_name)

                if not m2m_field.many_to_many:
                    continue

                related_model = m2m_field.related_model
                related_objects = related_model.objects.filter(pk__in=related_ids)

                getattr(instance, field_name).set(related_objects)

                total_linked += len(related_objects)

                self.stdout.write(
                    self.style.SUCCESS(
                        f'  ✓ {model_label} (pk={pk}): {len(related_objects)} vínculo(s) em {field_name}'
                    )
                )

            except model_class.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f'  ⚠ {model_label} (pk={pk}) não encontrado, pulando relacionamento {field_name}'
                    )
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f'  ✗ Erro ao processar {model_label} (pk={pk}).{field_name}: {str(e)}'
                    )
                )

        if total_linked > 0:
            self.stdout.write(
                self.style.SUCCESS(f'\n{total_linked} vínculos ManyToMany criados.')
            )