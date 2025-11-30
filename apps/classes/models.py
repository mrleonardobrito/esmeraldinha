from django.db import models


class Class(models.Model):
    code = models.CharField(max_length=20, unique=True,
                            help_text="Código da turma")
    label = models.CharField(
        max_length=100, help_text="Nome da turma (ex: 4° ano)")
    school = models.ForeignKey(
        'school.School', on_delete=models.CASCADE, related_name='classes')
    teacher = models.ForeignKey(
        'teacher.Teacher', on_delete=models.SET_NULL, null=True, blank=True, related_name='classes')

    class Meta:
        verbose_name = 'Turma'
        verbose_name_plural = 'Turmas'
        ordering = ['code']
