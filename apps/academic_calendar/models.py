from django.db import models

class AcademicCalendarSupportedTypes(models.TextChoices):
    PNG = 'png', 'PNG'
    JPEG = 'jpeg', 'JPEG'
    PDF = 'pdf', 'PDF'
    
class AcademicCalendarImage(models.Model):
    year = models.IntegerField()
    image_file = models.BinaryField()
    image_format = models.CharField(max_length=10)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processed = models.BooleanField(default=False)
    

class AcademicCalendar(models.Model):
    year = models.IntegerField()
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
