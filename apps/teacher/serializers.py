from rest_framework import serializers
from apps.teacher.models import Teacher, ReductionDay, DiaryType
from apps.school.models import School
from apps.school.serializers import SchoolSerializer

class TeacherSerializer(serializers.ModelSerializer):
    school = SchoolSerializer(read_only=True)
    school_id = serializers.IntegerField(write_only=True, required=False)
    reduction_day_display = serializers.CharField(source='get_reduction_day_display', read_only=True)
    diary_type_display = serializers.CharField(source='get_diary_type_display', read_only=True)

    class Meta:
        model = Teacher
        fields = [
            'id',
            'code',
            'reduction_day',
            'reduction_day_display',
            'diary_type',
            'diary_type_display',
            'school',
            'school_id'
        ]
        read_only_fields = ['id']

