from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.academic_calendars.views import AcademicCalendarImageProcessorView, AcademicCalendarViewSet

router = DefaultRouter()
router.register(r'academic-calendars', AcademicCalendarViewSet)

urlpatterns = [
    path('academic-calendar/', AcademicCalendarImageProcessorView.as_view(), name='academic-calendar'),
    path('', include(router.urls)),
]

