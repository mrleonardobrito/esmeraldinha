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

    def create(self, validated_data):
        request_data = self.context['request'].data
        validated_data['teacher_id'] = request_data.get('teacher_id')
        validated_data['calendar_id'] = request_data.get('calendar_id')
        validated_data['title'] = request_data.get('title', '')
        validated_data['progress'] = request_data.get('progress', 0)
        return super().create(validated_data)
