import django_filters
from .models import Class


class ClassFilterSet(django_filters.FilterSet):
    school_id = django_filters.NumberFilter(field_name='school')
    teacher_id = django_filters.NumberFilter(field_name='teachers__id', distinct=True)

    class Meta:
        model = Class
        fields = {}

