from rest_framework import serializers
from .models import Class
from apps.school.models import School
from apps.teacher.models import Teacher


class ClassSerializer(serializers.ModelSerializer):
    school_id = serializers.PrimaryKeyRelatedField(
        queryset=School.objects.all(), source='school', write_only=True, required=True
    )
    teacher_id = serializers.PrimaryKeyRelatedField(
        queryset=Teacher.objects.all(), source='teacher', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Class
        fields = ["id", "code", "label", "school_id", "teacher_id"]
        read_only_fields = ["id"]
