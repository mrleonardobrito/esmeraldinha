from rest_framework import serializers
from apps.academic_calendars.models import AcademicCalendarSupportedTypes, AcademicCalendar

class ReferenceSerializer(serializers.Serializer):
    image = serializers.FileField(
        required=True,
        help_text="Arquivo de imagem do calendário acadêmico (PNG, JPEG ou PDF)",
        style={'input_type': 'file'},
    )

    def validate_image(self, value):
        if value.size > 1024 * 1024 * 5:
            raise serializers.ValidationError("O tamanho do arquivo deve ser menor que 5MB")
        
        file_extension = value.name.split('.')[-1].lower()
        if file_extension not in [type.value for type in AcademicCalendarSupportedTypes]:
            raise serializers.ValidationError("A extensão do arquivo deve ser PNG, JPEG ou PDF")
        
        return value

class ProcessedCalendarSerializer(serializers.Serializer):
    year = serializers.IntegerField(required=True, help_text="The year of the calendar")
    calendar_data = serializers.JSONField(required=True, help_text="The data of the calendar")

class AcademicCalendarSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicCalendar
        fields = [
            'id',
            'year',
            'calendar_data',
            'processed_at'
        ]
        read_only_fields = ['id', 'processed_at']