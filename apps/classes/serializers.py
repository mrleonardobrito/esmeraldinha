from rest_framework import serializers
from .models import Class
from apps.schools.models import School
from apps.schools.serializers import SchoolSerializer
from apps.teachers.models import Teacher


class TeacherResumedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Teacher
        fields = ['id', 'name', 'code']
        read_only_fields = ['id']


class ClassSerializer(serializers.ModelSerializer):
    school = SchoolSerializer(read_only=True)
    school_id = serializers.PrimaryKeyRelatedField(
        queryset=School.objects.all(), source='school', write_only=True, required=True
    )

    class Meta:
        model = Class
        fields = [
            "id", "code", "label", "school_id", "school"]
        read_only_fields = ["id"]

class ClassResumedSerializer(serializers.ModelSerializer):
    school_id = serializers.PrimaryKeyRelatedField(
        queryset=School.objects.all(), source='school', required=True
    )
    class Meta:
        model = Class
        fields = ["id", "code", "label", "school_id"]
        read_only_fields = ["id"]
