from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
import logging

logger = logging.getLogger(__name__)


class ErrorHandlingMiddleware(MiddlewareMixin):
    def process_exception(self, request, exception):
        logger.error(
            f'Erro não tratado: {exception}',
            exc_info=True,
            extra={
                'path': request.path,
                'method': request.method,
            }
        )
        
        return JsonResponse(
            {
                'error': 'internal_server_error',
                'message': 'Ocorreu um erro interno no servidor',
                'detail': str(exception) if hasattr(exception, '__str__') else 'Erro desconhecido',
                'status_code': 500
            },
            status=500
        )

