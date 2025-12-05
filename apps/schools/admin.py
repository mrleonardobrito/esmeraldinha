from django.contrib import admin
from apps.schools.models import School


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'code']
    list_filter = ['code']
    search_fields = ['name', 'code']
    ordering = ['name']

