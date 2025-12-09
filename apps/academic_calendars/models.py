from django.db import models


class AcademicCalendarSupportedTypes(models.TextChoices):
    PNG = 'png', 'PNG'
    JPEG = 'jpeg', 'JPEG'
    PDF = 'pdf', 'PDF'


class LegendType(models.TextChoices):
    SCHOOL_DAY = 'letivo', 'Dia Letivo'
    NON_SCHOOL_DAY = 'nao_letivo', 'Dia Não Letivo'
    NATIONAL_HOLIDAY = 'feriado_nacional', 'Feriado Nacional'
    MUNICIPAL_HOLIDAY = 'feriado_municipal', 'Feriado Municipal'
    OPTIONAL_DAY = 'ponto_facultativo', 'Ponto Facultativo'
    VACATION = 'ferias', 'Férias'
    RECESS = 'recesso', 'Recesso'
    PLANNING = 'planejamento', 'Planejamento'
    RECOVERY_EVALUATION = 'avaliacao_recuperacao', 'Avaliação de Recuperação'
    EVENT = 'evento', 'Evento'


class AcademicCalendarImage(models.Model):
    year = models.IntegerField()
    image_file = models.BinaryField()
    image_format = models.CharField(max_length=10)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processed = models.BooleanField(default=False)


class AcademicCalendar(models.Model):
    year = models.IntegerField(unique=True)
    source_image = models.OneToOneField(
        AcademicCalendarImage,
        on_delete=models.SET_NULL,
        null=True,
        related_name='processed_calendar'
    )

    calendar_data = models.JSONField(default=dict)
    processed_at = models.DateTimeField(auto_now_add=True)
    processing_errors = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['-year']


class Legend(models.Model):
    type = models.CharField(
        max_length=50,
        choices=LegendType.choices,
        unique=True,
        verbose_name='Tipo'
    )
    description = models.CharField(
        max_length=200,
        verbose_name='Descrição'
    )
    color_hex = models.CharField(
        max_length=7,
        blank=True,
        null=True,
        verbose_name='Cor Hexadecimal',
        help_text='Código hexadecimal da cor (ex: #FF0000)'
    )

    class Meta:
        verbose_name = 'Legenda'
        verbose_name_plural = 'Legendas'
        ordering = ['type']

    def __str__(self):
        return f"{self.get_type_display()} - {self.description}"


class CalendarDay(models.Model):
    """Armazena dias específicos do calendário letivo para uso como fixtures"""
    date = models.DateField(verbose_name='Data')
    type = models.CharField(
        max_length=50,
        choices=LegendType.choices,
        verbose_name='Tipo'
    )
    labels = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Rótulos',
        help_text='Lista de rótulos adicionais para o dia'
    )
    year = models.IntegerField(
        verbose_name='Ano',
        help_text='Ano do calendário letivo'
    )

    class Meta:
        verbose_name = 'Dia do Calendário'
        verbose_name_plural = 'Dias do Calendário'
        ordering = ['date']
        unique_together = ['date', 'year']

    def __str__(self):
        return f"{self.date} - {self.get_type_display()}"
