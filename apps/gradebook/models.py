from django.db import models
from apps.teacher.models import Teacher
from apps.academic_calendar.models import AcademicCalendar

class GradebookStatus(models.TextChoices):
    PENDING = 'pending'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'

class Gradebook(models.Model):
    teacher = models.ForeignKey(Teacher, related_name='gradebooks', on_delete=models.CASCADE)
    calendar = models.ForeignKey(AcademicCalendar, related_name='gradebooks', on_delete=models.CASCADE)
    content_registry = models.JSONField()
    status = models.CharField(max_length=20, choices=GradebookStatus.choices, default=GradebookStatus.PENDING)
    title = models.CharField(max_length=200, blank=True, default='')
    progress = models.IntegerField(default=0, help_text='Progresso da caderneta (0-100)')
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    class Meta:
        ordering = ['status', 'teacher__code']