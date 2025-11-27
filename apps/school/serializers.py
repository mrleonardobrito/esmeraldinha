from rest_framework import serializers
from apps.school.models import School


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ['id', 'name', 'code']
        read_only_fields = ['id']

    def validate_code(self, value):
        if self.instance and self.instance.code == value:
            return value
        if School.objects.filter(code=value).exists():
            raise serializers.ValidationError("Já existe uma escola com este código.")
        return value

