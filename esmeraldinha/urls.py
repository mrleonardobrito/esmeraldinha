from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularSwaggerSplitView, SpectacularAPIView

urlpatterns = [
    path('', SpectacularSwaggerSplitView.as_view(), name='docs'),
    path('admin/', admin.site.urls),
    
    path('api/', include('apps.academic_calendar.urls')),
    path('api/', include('apps.gradebook.urls')),
    path('api/', include('apps.school.urls')),
    path('api/', include('apps.teacher.urls')),
    
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
]
