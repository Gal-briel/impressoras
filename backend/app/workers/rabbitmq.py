# app/workers/rabbitmq.py
import json
import aio_pika
from typing import Dict, Any
from app.core.config import settings

class RabbitMQClient:
    def __init__(self):
        self.connection = None
        self.channel = None

    async def connect(self):
        self.connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        self.channel = await self.connection.channel()

    async def publish_command(self, routing_key: str, payload: Dict[str, Any]):
        if not self.channel:
            await self.connect()
        message = aio_pika.Message(
            body=json.dumps(payload, default=str).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        await self.channel.default_exchange.publish(message, routing_key=routing_key)

rabbitmq_client = RabbitMQClient()