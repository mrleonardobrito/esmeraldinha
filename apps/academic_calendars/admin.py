from django.contrib import admin
from apps.academic_calendars.models import AcademicCalendar, Legend, CalendarDay


@admin.register(AcademicCalendar)
class AcademicCalendarAdmin(admin.ModelAdmin):
    list_display = ['year', 'processed_at']
    list_filter = ['year', 'processed_at']
    search_fields = ['year']


@admin.register(Legend)
class LegendAdmin(admin.ModelAdmin):
    list_display = ['type', 'description', 'color_hex']
    search_fields = ['type', 'description']


@admin.register(CalendarDay)
class CalendarDayAdmin(admin.ModelAdmin):
    list_display = ['date', 'type', 'year']
    list_filter = ['type', 'year', 'date']
    search_fields = ['date', 'labels']
    date_hierarchy = 'date'
