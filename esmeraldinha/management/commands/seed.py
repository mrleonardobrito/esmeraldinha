from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.conf import settings
from pathlib import Path
import os


class Command(BaseCommand):
    help = 'Carrega fixtures de todos os apps que possuem pasta fixtures'

    def handle(self, *args, **options):
        base_dir = Path(settings.BASE_DIR)

        self.stdout.write(
            self.style.SUCCESS('Iniciando carregamento de fixtures...')
        )

        fixtures_loaded = False

        for app_config in settings.INSTALLED_APPS:
            if not app_config.startswith('apps.'):
                continue

            app_name = app_config.split('.')[-1]
            app_path = base_dir / 'apps' / app_name
            fixtures_path = app_path / 'fixtures'

            if not fixtures_path.exists():
                self.stdout.write(
                    f'  App "{app_name}": pasta fixtures não encontrada, pulando...'
                )
                continue

            json_files = list(fixtures_path.glob('*.json'))

            if not json_files:
                self.stdout.write(
                    f'  App "{app_name}": nenhum arquivo .json encontrado em fixtures, pulando...'
                )
                continue

            self.stdout.write(
                self.style.WARNING(
                    f'  Carregando fixtures do app "{app_name}":')
            )

            for json_file in json_files:
                fixture_name = json_file.stem  # nome sem extensão
                try:
                    self.stdout.write(f'    Carregando {fixture_name}...')
                    call_command('loaddata', fixture_name, verbosity=0)
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'      ✓ {fixture_name} carregado com sucesso')
                    )
                    fixtures_loaded = True
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f'      ✗ Erro ao carregar {fixture_name}: {str(e)}')
                    )

        if fixtures_loaded:
            self.stdout.write(
                self.style.SUCCESS('\nTodas as fixtures foram processadas!')
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    '\nNenhuma fixture foi encontrada para carregar.')
            )
