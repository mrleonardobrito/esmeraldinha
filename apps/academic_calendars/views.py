from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import viewsets
from rest_framework.decorators import action
from apps.academic_calendars.services import AcademicCalendarPDFProcessor
from apps.academic_calendars.models import AcademicCalendar, Legend, CalendarDay
from apps.academic_calendars.serializers import AcademicCalendarSerializer, AcademicCalendarCreateSerializer, LegendSerializer
from apps.academic_calendars.schemas import CalendarData, Day, DayType, LegendItem
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
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    lookup_field = 'year'
    lookup_value_regex = r'\d{4}'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        year = int(kwargs.get(self.lookup_field))
        try:
            instance = self.get_object()
        except Exception:
            instance = None

        serializer = self.get_serializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        data_year = data.get('year', year)
        if data_year != year:
            return Response(
                {'error': 'Ano no corpo da requisição difere do ano na URL.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        instance, _ = AcademicCalendar.objects.update_or_create(
            year=year,
            defaults={'calendar_data': data['calendar_data']}
        )

        output_serializer = self.get_serializer(instance)
        return Response(output_serializer.data)

    def _generate_all_days_of_year(self, year: int, default_type: str = 'nao_letivo') -> List[Day]:
        days: List[Day] = []
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        try:
            day_type = DayType(default_type)
        except ValueError:
            day_type = DayType.NON_SCHOOL_DAY

        current_date = start_date
        while current_date <= end_date:
            days.append(Day(
                date=current_date.isoformat(),
                type=day_type,
                labels=[]
            ))
            current_date += timedelta(days=1)

        return days

    def _get_legends_from_db(self, allowed_types: List[str] | None = None) -> List[LegendItem]:
        qs = Legend.objects.all()
        if allowed_types:
            qs = qs.filter(type__in=allowed_types)
        legends_db = qs
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
    @action(detail=True, methods=['post'], url_path='process-pdf', parser_classes=[MultiPartParser, FormParser])
    def process_pdf(self, request, year=None):
        create_serializer = AcademicCalendarCreateSerializer(data=request.data)
        if not create_serializer.is_valid():
            return Response(create_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pdf_file = create_serializer.validated_data['calendar_file']
        default_legend_type = request.data.get(
            'default_legend_type', 'nao_letivo')

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

            target_year = int(
                year) if year is not None else processed_data.year
            processed_year = processed_data.year or target_year

            if processed_year != target_year:
                processed_year = target_year

            self._ensure_fixtures_loaded(processed_year)

            all_days = self._generate_all_days_of_year(
                processed_year,
                default_legend_type
            )

            fixture_days = self._get_fixture_days(processed_year)
            fixture_days_dict = {
                day.date: day for day in fixture_days
            }

            processed_days_dict = {
                day.date: day for day in processed_data.days
            }

            calendar_days = []
            for day in all_days:
                if day.date in processed_days_dict:
                    calendar_days.append(processed_days_dict[day.date])
                elif day.date in fixture_days_dict:
                    calendar_days.append(fixture_days_dict[day.date])
                else:
                    calendar_days.append(day)

            used_types = {d.type for d in calendar_days}
            legends = self._get_legends_from_db(list(used_types))

            result = CalendarData(
                year=processed_year,
                stages=processed_data.stages,
                days=calendar_days,
                legend=legends,
                monthly_meta=getattr(processed_data, 'monthly_meta', None)
            )

            AcademicCalendar.objects.update_or_create(
                year=processed_year,
                defaults={'calendar_data': result.model_dump()}
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

    def get_queryset(self):
        qs = Legend.objects.all()
        year = self.request.query_params.get('year')
        if year and year.isdigit():
            types_in_year = (
                CalendarDay.objects
                .filter(year=int(year))
                .values_list('type', flat=True)
                .distinct()
            )
            qs = qs.filter(type__in=list(types_in_year))
        return qs
