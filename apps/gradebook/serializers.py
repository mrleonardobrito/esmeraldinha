from rest_framework import serializers
from apps.gradebook.models import Gradebook
from apps.teacher.serializers import TeacherSerializer
from apps.academic_calendar.serializers import AcademicCalendarSerializer


class GradebookSerializer(serializers.ModelSerializer):
    teacher = TeacherSerializer(read_only=True)
    calendar = AcademicCalendarSerializer(read_only=True)

    class Meta:
        model = Gradebook
        fields = [
            'id',
            'teacher',
            'calendar',
            'status',
            'title',
            'progress',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']
