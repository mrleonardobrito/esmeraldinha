from django.db import models
from apps.school.models import School


class ReductionDay(models.IntegerChoices):
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5


class DiaryType(models.TextChoices):
    C1 = 'c1'
    C2 = 'c2'


class Teacher(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=6)
    password = models.CharField()
    reduction_day = models.IntegerField(choices=ReductionDay.choices)
    diary_type = models.CharField(choices=DiaryType.choices)
    school = models.ForeignKey(School, on_delete=models.CASCADE)

    class Meta:
        ordering = ['code', 'school__name']
