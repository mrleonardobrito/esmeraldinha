from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from drf_spectacular.views import SpectacularSwaggerSplitView, SpectacularAPIView

def health_check(request):
    return JsonResponse({'status': 'ok', 'message': 'API está funcionando corretamente'})

urlpatterns = [
    path('', SpectacularSwaggerSplitView.as_view(), name='docs'),
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),

    path('api/', include('apps.academic_calendars.urls')),
    path('api/', include('apps.classes.urls')),
    path('api/', include('apps.gradebooks.urls')),
    path('api/', include('apps.schools.urls')),
    path('api/', include('apps.teachers.urls')),

    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
]
