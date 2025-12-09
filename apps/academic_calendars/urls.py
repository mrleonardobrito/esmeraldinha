from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.academic_calendars.views import AcademicCalendarViewSet, LegendViewSet

router = DefaultRouter()
router.register(r'academic-calendars', AcademicCalendarViewSet)
router.register(r'legends', LegendViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
