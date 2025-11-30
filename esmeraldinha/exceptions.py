from rest_framework.views import exception_handler
from rest_framework import status
from rest_framework.response import Response
from django.core.exceptions import ValidationError
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        if isinstance(exc, ValidationError):
            return Response(
                {
                    'error': 'validation_error',
                    'message': 'Erro de validação',
                    'detail': exc.messages if hasattr(exc, 'messages') else str(exc),
                    'status_code': status.HTTP_400_BAD_REQUEST
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        return None

    custom_response_data = {
        'error': _get_error_code(exc, response.status_code),
        'message': _get_user_friendly_message(exc, response),
        'status_code': response.status_code
    }

    if hasattr(response, 'data') and response.data:
        if 'message' in response.data:
                custom_response_data['message'] = response.data['message']
        if 'detail' in response.data:
            custom_response_data['detail'] = response.data['detail']
        elif 'non_field_errors' in response.data:
            custom_response_data['detail'] = response.data['non_field_errors']
        else:
            custom_response_data['detail'] = response.data

    response.data = custom_response_data
    return response


def _get_error_code(exc, status_code):
    error_code_map = {
        status.HTTP_400_BAD_REQUEST: 'bad_request',
        status.HTTP_401_UNAUTHORIZED: 'unauthorized',
        status.HTTP_403_FORBIDDEN: 'forbidden',
        status.HTTP_404_NOT_FOUND: 'not_found',
        status.HTTP_405_METHOD_NOT_ALLOWED: 'method_not_allowed',
        status.HTTP_409_CONFLICT: 'conflict',
        status.HTTP_422_UNPROCESSABLE_ENTITY: 'validation_error',
        status.HTTP_429_TOO_MANY_REQUESTS: 'too_many_requests',
        status.HTTP_500_INTERNAL_SERVER_ERROR: 'internal_server_error',
        status.HTTP_503_SERVICE_UNAVAILABLE: 'service_unavailable',
    }
    
    exception_type = type(exc).__name__
    if 'ValidationError' in exception_type or 'Validation' in exception_type:
        return 'validation_error'
    if 'NotFound' in exception_type or 'DoesNotExist' in exception_type:
        return 'not_found'
    if 'PermissionDenied' in exception_type:
        return 'forbidden'
    if 'AuthenticationFailed' in exception_type:
        return 'unauthorized'
    
    return error_code_map.get(status_code, 'unknown_error')


def _get_user_friendly_message(exc, response):
    if hasattr(response, 'data') and response.data:
        if isinstance(response.data, dict):
            if 'message' in response.data:
                return response.data['message']
            if 'detail' in response.data:
                return response.data['detail']
            if 'non_field_errors' in response.data:
                errors = response.data['non_field_errors']
                if isinstance(errors, list) and len(errors) > 0:
                    return errors[0]
    
    status_code = response.status_code if hasattr(response, 'status_code') else 500
    default_messages = {
        status.HTTP_400_BAD_REQUEST: 'Requisição inválida',
        status.HTTP_401_UNAUTHORIZED: 'Não autorizado',
        status.HTTP_403_FORBIDDEN: 'Acesso negado',
        status.HTTP_404_NOT_FOUND: 'Recurso não encontrado',
        status.HTTP_405_METHOD_NOT_ALLOWED: 'Método não permitido',
        status.HTTP_409_CONFLICT: 'Conflito na requisição',
        status.HTTP_422_UNPROCESSABLE_ENTITY: 'Erro de validação',
        status.HTTP_429_TOO_MANY_REQUESTS: 'Muitas requisições',
        status.HTTP_500_INTERNAL_SERVER_ERROR: 'Erro interno do servidor',
        status.HTTP_503_SERVICE_UNAVAILABLE: 'Serviço indisponível',
    }
    
    return default_messages.get(status_code, 'Ocorreu um erro')

