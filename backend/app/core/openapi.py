# backend/app/core/openapi.py
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


AGENT_AUTH_PATHS = {
    ("/api/v1/agents/check-in", "post"),
    ("/api/v1/agents/events", "post"),
    ("/api/v1/agents/version", "get"),
}


def configure_openapi(app: FastAPI) -> None:
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema

        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )

        components = openapi_schema.setdefault("components", {})
        security_schemes = components.setdefault("securitySchemes", {})

        security_schemes["AgentApiKey"] = {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Use exatamente: ApiKey dev-agent-api-key",
        }

        paths = openapi_schema.get("paths", {})

        for path, methods in paths.items():
            for method, operation in methods.items():
                if (path, method.lower()) not in AGENT_AUTH_PATHS:
                    continue

                # O Swagger não lida bem com Authorization como parâmetro normal.
                # Então removemos o parâmetro visual e usamos securitySchemes.
                parameters = operation.get("parameters", [])
                operation["parameters"] = [
                    parameter
                    for parameter in parameters
                    if parameter.get("name", "").lower() != "authorization"
                ]

                for parameter in operation.get("parameters", []):
                    if parameter.get("name", "").lower() == "x-agent-id":
                        parameter["description"] = (
                            "ID do agente que está fazendo a requisição."
                        )
                        parameter["example"] = (
                            "de214771-7f03-4e31-a2e0-c960ca000f05"
                        )

                operation["security"] = [
                    {
                        "AgentApiKey": [],
                    }
                ]

        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi