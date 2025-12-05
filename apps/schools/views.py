from rest_framework import viewsets
from apps.schools.models import School
from apps.schools.serializers import SchoolSerializer
from drf_spectacular.utils import extend_schema, OpenApiResponse


@extend_schema(tags=['Escolas'])
class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer

    @extend_schema(
        summary='Lista todas as escolas',
        description='Retorna uma lista paginada de todas as escolas cadastradas. Use os parâmetros ?page=N para navegar entre páginas.',
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        summary='Cria uma nova escola',
        description='Cria uma nova escola com os dados fornecidos',
        request=SchoolSerializer,
        responses={
            201: OpenApiResponse(
                response=SchoolSerializer,
                description='Escola criada com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos'
            )
        }
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @extend_schema(
        summary='Retorna detalhes de uma escola',
        description='Retorna os detalhes completos de uma escola específica',
        responses={
            200: OpenApiResponse(
                response=SchoolSerializer,
                description='Escola retornada com sucesso'
            ),
            404: OpenApiResponse(
                description='Escola não encontrada'
            )
        }
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        summary='Atualiza uma escola',
        description='Atualiza todos os campos de uma escola',
        request=SchoolSerializer,
        responses={
            200: OpenApiResponse(
                response=SchoolSerializer,
                description='Escola atualizada com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos'
            ),
            404: OpenApiResponse(
                description='Escola não encontrada'
            )
        }
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        summary='Atualiza parcialmente uma escola',
        description='Atualiza apenas os campos fornecidos de uma escola',
        request=SchoolSerializer,
        responses={
            200: OpenApiResponse(
                response=SchoolSerializer,
                description='Escola atualizada com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos'
            ),
            404: OpenApiResponse(
                description='Escola não encontrada'
            )
        }
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        summary='Deleta uma escola',
        description='Remove uma escola do sistema',
        responses={
            204: OpenApiResponse(
                description='Escola deletada com sucesso'
            ),
            404: OpenApiResponse(
                description='Escola não encontrada'
            )
        }
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

