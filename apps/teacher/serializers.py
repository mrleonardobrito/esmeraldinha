from rest_framework import serializers
from apps.teacher.models import Teacher, ReductionDay, DiaryType
from apps.school.models import School
from apps.school.serializers import SchoolSerializer
from apps.classes.models import Class
from apps.classes.serializers import ClassSerializer


class TeacherSerializer(serializers.ModelSerializer):
    school_id = serializers.IntegerField(write_only=True, required=False)
    classes = ClassSerializer(many=True, read_only=True)
    class_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="IDs das turmas que o professor leciona"
    )
    diary_type = serializers.ChoiceField(
        choices=DiaryType.choices,
        help_text="Formato c1 ou c2",
    )

    class Meta:
        model = Teacher
        fields = [
            'id',
            'name',
            'code',
            'reduction_day',
            'diary_type',
            'school_id',
            'classes',
            'class_ids'
        ]
        read_only_fields = ['id']
