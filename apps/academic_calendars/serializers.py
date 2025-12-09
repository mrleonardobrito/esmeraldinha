from rest_framework import serializers
from apps.academic_calendars.models import AcademicCalendarSupportedTypes, AcademicCalendar, Legend, LegendType
from apps.academic_calendars.schemas import CalendarData
from pydantic import ValidationError as PydanticValidationError


class ReferenceSerializer(serializers.Serializer):
    image = serializers.FileField(
        required=True,
        help_text="Arquivo de imagem do calendário acadêmico (PNG, JPEG ou PDF)",
        style={'input_type': 'file'},
    )

    def validate_image(self, value):
        if value.size > 1024 * 1024 * 5:
            raise serializers.ValidationError(
                "O tamanho do arquivo deve ser menor que 5MB")

        file_extension = value.name.split('.')[-1].lower()
        if file_extension not in [type.value for type in AcademicCalendarSupportedTypes]:
            raise serializers.ValidationError(
                "A extensão do arquivo deve ser PNG, JPEG ou PDF")

        return value


class ProcessedCalendarSerializer(serializers.Serializer):
    year = serializers.IntegerField(
        required=True, help_text="The year of the calendar")
    calendar_data = serializers.JSONField(
        required=True, help_text="The data of the calendar")

    def validate_calendar_data(self, value):
        try:
            CalendarData(**value)
        except PydanticValidationError as e:
            raise serializers.ValidationError(
                f"Dados do calendário inválidos: {e}")
        return value


class AcademicCalendarCreateSerializer(serializers.Serializer):
    calendar_file = serializers.FileField(
        required=True,
        help_text="Arquivo do calendário acadêmico (PDF)",
    )

    def validate_calendar_file(self, value):
        if value.size > 1024 * 1024 * 5:
            raise serializers.ValidationError(
                "O tamanho do arquivo deve ser menor que 5MB")

        file_extension = value.name.split('.')[-1].lower()
        if file_extension not in [type.value for type in AcademicCalendarSupportedTypes]:
            raise serializers.ValidationError(
                "A extensão do arquivo deve ser PNG, JPEG ou PDF")

        return value


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

    def validate_calendar_data(self, value):
        try:
            CalendarData(**value)
        except PydanticValidationError as e:
            raise serializers.ValidationError(
                f"Dados do calendário inválidos: {e}")
        return value


class LegendSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(
        source='get_type_display',
        read_only=True
    )

    class Meta:
        model = Legend
        fields = [
            'id',
            'type',
            'type_display',
            'description',
            'color_hex'
        ]
        read_only_fields = ['id']

    def validate_color_hex(self, value):
        if value:
            # Validar formato hexadecimal
            import re
            if not re.match(r'^#[0-9A-Fa-f]{6}$', value):
                raise serializers.ValidationError(
                    "A cor deve estar no formato hexadecimal válido (#RRGGBB)"
                )
        return value
