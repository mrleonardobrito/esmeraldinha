from rest_framework import serializers
from apps.gradebooks.models import Gradebook
from apps.teachers.serializers import TeacherSerializer
from apps.academic_calendars.serializers import AcademicCalendarSerializer


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
