from django.test import SimpleTestCase, RequestFactory
from django.http import JsonResponse
import json
from esmeraldinha.middleware import ErrorHandlingMiddleware
from rest_framework import status
from rest_framework.response import Response
from django.core.exceptions import ValidationError
from unittest.mock import patch
from esmeraldinha.exceptions import custom_exception_handler, _get_error_code, _get_user_friendly_message
from rest_framework.exceptions import NotFound, PermissionDenied, AuthenticationFailed

class ErrorHandlingMiddlewareTestCase(SimpleTestCase):

    def setUp(self):
        self.factory = RequestFactory()

    def test_process_exception_returns_json_response(self):
        """Middleware deve registrar o erro e retornar JsonResponse 500"""
        request = self.factory.get('/erro/')
        middleware = ErrorHandlingMiddleware(get_response=lambda r: r)

        logger_name = 'esmeraldinha.middleware'

        with self.assertLogs(logger_name, level='ERROR') as cm:
            response = middleware.process_exception(
                request, ValueError('falhou')
            )

        self.assertIsInstance(response, JsonResponse)
        self.assertEqual(response.status_code, 500)

        data = json.loads(response.content.decode('utf-8'))
        self.assertEqual(data['error'], 'internal_server_error')
        self.assertEqual(
            data['message'],
            'Ocorreu um erro interno no servidor',
        )
        self.assertIn('detail', data)
        self.assertTrue(any('falhou' in msg for msg in cm.output))


class CustomExceptionHandlerTestCase(SimpleTestCase):

    def setUp(self):
        self.factory = RequestFactory()

    def test_validation_error_without_drf_response(self):
        """ValidationError do Django deve ser tratado com resposta 400"""
        request = self.factory.get('/test/')
        exc = ValidationError(['Erro 1', 'Erro 2'])

        response = custom_exception_handler(exc, {'request': request})

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error'], 'validation_error')
        self.assertEqual(response.data['status_code'],
                         status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_unknown_exception_returns_none_when_not_handled(self):
        """Exceções não tratadas pelo DRF retornam None"""
        request = self.factory.get('/test/')
        exc = Exception('Erro genérico')

        response = custom_exception_handler(exc, {'request': request})

        self.assertIsNone(response)

    def test_get_error_code_mapped_and_by_exception_name(self):
        """Mapeamento de códigos de erro cobre os principais casos"""
        self.assertEqual(
            _get_error_code(
                ValidationError('x'), status.HTTP_400_BAD_REQUEST),
            'validation_error',
        )
        self.assertEqual(
            _get_error_code(
                NotFound('x'), status.HTTP_404_NOT_FOUND),
            'not_found',
        )
        self.assertEqual(
            _get_error_code(
                PermissionDenied('x'), status.HTTP_403_FORBIDDEN),
            'forbidden',
        )
        self.assertEqual(
            _get_error_code(
                AuthenticationFailed('x'),
                status.HTTP_401_UNAUTHORIZED),
            'unauthorized',
        )
        # Caso padrão desconhecido
        self.assertEqual(
            _get_error_code(
                Exception('x'), status.HTTP_500_INTERNAL_SERVER_ERROR),
            'internal_server_error',
        )
        # Status não mapeado deve cair em unknown_error
        self.assertEqual(
            _get_error_code(
                Exception('x'), 418),
            'unknown_error',
        )

    def test_get_user_friendly_message_from_response_data(self):
        """Mensagem amigável deve ser extraída de response.data quando possível"""
        response = Response(
            data={'detail': 'Detalhe do erro'},
            status=status.HTTP_400_BAD_REQUEST,
        )

        message = _get_user_friendly_message(Exception('x'), response)
        self.assertEqual(message, 'Detalhe do erro')

    def test_get_user_friendly_message_from_default_messages(self):
        """Mensagem padrão é usada quando não há dados na resposta"""
        response = Response(status=status.HTTP_404_NOT_FOUND)

        message = _get_user_friendly_message(Exception('x'), response)
        self.assertEqual(message, 'Recurso não encontrado')

    def test_get_user_friendly_message_for_unknown_status_uses_generic_message(self):
        """Quando o status não é mapeado, deve usar a mensagem genérica"""
        response = Response(status=599)

        message = _get_user_friendly_message(Exception('x'), response)
        self.assertEqual(message, 'Ocorreu um erro')

    def test_get_user_friendly_message_from_non_field_errors(self):
        """Quando existir non_field_errors, a primeira mensagem deve ser usada"""
        response = Response(
            data={'non_field_errors': ['Erro 1', 'Erro 2']},
            status=status.HTTP_400_BAD_REQUEST,
        )

        message = _get_user_friendly_message(Exception('x'), response)
        self.assertEqual(message, 'Erro 1')

    def test_custom_exception_handler_enriches_response_with_message_and_detail(self):
        """custom_exception_handler deve adaptar message e detail do DRF"""
        drf_response = Response(
            data={'message': 'Mensagem DRF', 'detail': 'Detalhe DRF'},
            status=status.HTTP_400_BAD_REQUEST,
        )
        request = self.factory.get('/test/')

        with patch('esmeraldinha.exceptions.exception_handler',
                   return_value=drf_response):
            response = custom_exception_handler(Exception('x'),
                                                {'request': request})

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['message'], 'Mensagem DRF')
        self.assertEqual(response.data['detail'], 'Detalhe DRF')

    def test_custom_exception_handler_handles_non_field_errors_list(self):
        """custom_exception_handler deve mover non_field_errors para detail"""
        drf_response = Response(
            data={'non_field_errors': ['Erro 1', 'Erro 2']},
            status=status.HTTP_400_BAD_REQUEST,
        )
        request = self.factory.get('/test/')

        with patch('esmeraldinha.exceptions.exception_handler',
                   return_value=drf_response):
            response = custom_exception_handler(Exception('x'),
                                                {'request': request})

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], ['Erro 1', 'Erro 2'])
