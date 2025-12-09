from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import viewsets
from rest_framework.decorators import action
from apps.academic_calendars.services import AcademicCalendarPDFProcessor
from apps.academic_calendars.models import AcademicCalendar, Legend, CalendarDay
from apps.academic_calendars.serializers import AcademicCalendarSerializer, AcademicCalendarCreateSerializer, ProcessedCalendarSerializer, LegendSerializer
from apps.academic_calendars.schemas import CalendarData, Day, DayType, LegendItem, Stage
from drf_spectacular.utils import extend_schema, OpenApiResponse, extend_schema_view
from datetime import date, timedelta
from typing import List


@extend_schema_view(
    list=extend_schema(tags=['Calendário Acadêmico']),
    retrieve=extend_schema(tags=['Calendário Acadêmico']),
    create=extend_schema(tags=['Calendário Acadêmico']),
    update=extend_schema(tags=['Calendário Acadêmico']),
    partial_update=extend_schema(tags=['Calendário Acadêmico']),
    destroy=extend_schema(tags=['Calendário Acadêmico']),
)
class AcademicCalendarViewSet(viewsets.ModelViewSet):
    queryset = AcademicCalendar.objects.all()
    serializer_class = AcademicCalendarSerializer
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'calendar_file': {
                        'type': 'string',
                        'format': 'binary',
                        'description': 'Arquivo do calendário acadêmico (PNG, JPEG ou PDF)'
                    }
                },
                'required': ['calendar_file']
            }
        },
        responses={
            status.HTTP_201_CREATED: OpenApiResponse(
                response=AcademicCalendarSerializer,
                description='Calendário criado com sucesso'
            ),
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(
                description='Erro ao processar o arquivo ou validar os dados'
            )
        }
    )
    def create(self, request, *args, **kwargs):
        create_serializer = AcademicCalendarCreateSerializer(data=request.data)
        if not create_serializer.is_valid():
            return Response(create_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pdf_file = create_serializer.validated_data['calendar_file']
        pdf_file.seek(0)
        pdf_bytes = pdf_file.read()

        try:
            processor = AcademicCalendarPDFProcessor()
            processed_data: CalendarData = processor.process_pdf(pdf_bytes)

            print(processed_data)
        except Exception as e:
            return Response(
                {'error': 'Erro ao processar o PDF', 'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(processed_data.model_dump(), status=status.HTTP_201_CREATED)

    def _generate_all_days_of_year(self, year: int, default_type: str = 'nao_letivo') -> List[Day]:
        """Gera todos os dias do ano marcados com um tipo padrão"""
        days: List[Day] = []
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        # Validar e converter o tipo padrão
        try:
            day_type = DayType(default_type)
        except ValueError:
            day_type = DayType.NON_SCHOOL_DAY  # Fallback para nao_letivo

        current_date = start_date
        while current_date <= end_date:
            days.append(Day(
                date=current_date.isoformat(),
                type=day_type,
                labels=[]
            ))
            current_date += timedelta(days=1)

        return days

    def _get_legends_from_db(self) -> List[LegendItem]:
        """Busca todas as legendas do banco de dados"""
        legends_db = Legend.objects.all()
        result = []
        for legend in legends_db:
            try:
                day_type = DayType(legend.type)
                result.append(LegendItem(
                    type=day_type,
                    description=legend.description,
                    color_hex=legend.color_hex
                ))
            except ValueError:
                # Ignora legendas com tipos inválidos
                continue
        return result

    def _get_fixture_days(self, year: int) -> List[Day]:
        """Busca dias específicos das fixtures para um determinado ano"""
        fixture_days_db = CalendarDay.objects.filter(year=year)
        result = []
        for fixture_day in fixture_days_db:
            try:
                day_type = DayType(fixture_day.type)
                result.append(Day(
                    date=fixture_day.date.isoformat(),
                    type=day_type,
                    labels=fixture_day.labels or []
                ))
            except ValueError:
                # Ignora dias com tipos inválidos
                continue
        return result

    @extend_schema(
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'calendar_file': {
                        'type': 'string',
                        'format': 'binary',
                        'description': 'Arquivo do calendário acadêmico (PDF)'
                    },
                    'default_legend_type': {
                        'type': 'string',
                        'description': 'Tipo de legenda padrão para dias não especificados (ex: letivo, nao_letivo)'
                    }
                },
                'required': ['calendar_file']
            }
        },
        responses={
            status.HTTP_200_OK: OpenApiResponse(
                response=CalendarData,
                description='Calendário processado com sucesso'
            ),
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(
                description='Erro ao processar o arquivo ou validar os dados'
            )
        },
        tags=['Calendário Acadêmico']
    )
    @action(detail=False, methods=['post'], url_path='process')
    def process(self, request):
        """Processa um arquivo PDF de calendário e retorna os dados processados"""
        create_serializer = AcademicCalendarCreateSerializer(data=request.data)
        if not create_serializer.is_valid():
            return Response(create_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pdf_file = create_serializer.validated_data['calendar_file']
        default_legend_type = request.data.get(
            'default_legend_type', 'nao_letivo')

        # Validar tipo de legenda padrão
        try:
            DayType(default_legend_type)
        except ValueError:
            return Response(
                {'error': f'Tipo de legenda padrão inválido: {default_legend_type}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        pdf_file.seek(0)
        pdf_bytes = pdf_file.read()

        try:
            processor = AcademicCalendarPDFProcessor()
            processed_data: CalendarData = processor.process_pdf(pdf_bytes)

            # Gerar todos os dias do ano com tipo padrão
            all_days = self._generate_all_days_of_year(
                processed_data.year,
                default_legend_type
            )

            # Buscar dias das fixtures para o ano processado
            fixture_days = self._get_fixture_days(processed_data.year)
            fixture_days_dict = {
                day.date: day for day in fixture_days
            }

            # Criar um dicionário dos dias processados do PDF para lookup rápido
            processed_days_dict = {
                day.date: day for day in processed_data.days
            }

            # Mesclar dias: PDF > Fixtures > Padrão
            calendar_days = []
            for day in all_days:
                if day.date in processed_days_dict:
                    # Prioridade 1: Usar o dia processado do PDF
                    calendar_days.append(processed_days_dict[day.date])
                elif day.date in fixture_days_dict:
                    # Prioridade 2: Usar o dia das fixtures
                    calendar_days.append(fixture_days_dict[day.date])
                else:
                    # Prioridade 3: Usar o dia padrão
                    calendar_days.append(day)

            # Buscar legendas do banco de dados
            legends = self._get_legends_from_db()

            # Criar resposta final
            result = CalendarData(
                year=processed_data.year,
                stages=processed_data.stages,
                days=calendar_days,
                legend=legends,
                monthly_meta=getattr(processed_data, 'monthly_meta', None)
            )

            return Response(result.model_dump(), status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {'error': 'Erro ao processar o PDF', 'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


@extend_schema_view(
    list=extend_schema(tags=['Legendas do Calendário']),
    retrieve=extend_schema(tags=['Legendas do Calendário']),
    create=extend_schema(tags=['Legendas do Calendário']),
    update=extend_schema(tags=['Legendas do Calendário']),
    partial_update=extend_schema(tags=['Legendas do Calendário']),
    destroy=extend_schema(tags=['Legendas do Calendário']),
)
class LegendViewSet(viewsets.ModelViewSet):
    queryset = Legend.objects.all()
    serializer_class = LegendSerializer
