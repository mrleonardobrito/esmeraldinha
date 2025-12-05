from django.shortcuts import render
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import viewsets
from apps.academic_calendars.services import AcademicCalendarImageProcessor
from apps.academic_calendars.models import AcademicCalendar
from apps.academic_calendars.serializers import ReferenceSerializer, ProcessedCalendarSerializer, AcademicCalendarSerializer
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiRequest, extend_schema_view

class AcademicCalendarImageProcessorView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    
    @extend_schema(
        tags=['Calendário Acadêmico'],
        summary='Processa uma imagem de calendário acadêmico',
        description='Processa uma imagem de calendário acadêmico e retorna os dados do calendário',
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'image': {
                        'type': 'string',
                        'format': 'binary',
                        'description': 'Arquivo de imagem do calendário acadêmico (PNG, JPEG ou PDF)'
                    }
                },
                'required': ['image']
            }
        },
        responses={
            status.HTTP_200_OK: OpenApiResponse(
                response=ProcessedCalendarSerializer,
                description='Imagem processada com sucesso'
            ),
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(
                response=ProcessedCalendarSerializer,
                description='Não foi possível processar a imagem'
            )
        }
    )
    def post(self, request):
        image_file = request.FILES.get('image')
        serializer = ReferenceSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        processor = AcademicCalendarImageProcessor()
        image_file_obj = serializer.validated_data['image']
        image_file_obj.seek(0)
        image_bytes = image_file_obj.read()
        processor.process_image(image_bytes)
        return Response({'message': 'Image processed successfully'}, status=status.HTTP_200_OK)

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