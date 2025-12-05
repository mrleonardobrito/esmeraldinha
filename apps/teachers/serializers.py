from rest_framework import serializers
from apps.teachers.models import Teacher, DiaryType
from apps.classes.models import Class
from apps.classes.serializers import ClassSerializer


class TeacherSerializer(serializers.ModelSerializer):
    classes = ClassSerializer(many=True, read_only=True)
    class_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Class.objects.all(),
        source='classes',
        write_only=True,
        required=False,
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
            'class_ids',
            'classes'
        ]
        read_only_fields = ['id']
