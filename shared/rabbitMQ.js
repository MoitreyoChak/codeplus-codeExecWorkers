import amqp from "amqplib";

const BROKER_URL = process.env.BROKER_URL || 'amqp://localhost';
let ch = null;

export const connectRabbitMQ = async (queueName) => {
    if (ch) return ch;

    try {
        const conn = await amqp.connect(BROKER_URL);
        ch = await conn?.createChannel();
        await ch.assertQueue(queueName, { durable: true });
        console.log("✅ Connected to RabbitMQ");
    } catch (error) {
        console.log("Oops something went wrong during RabbitMQ connection!")
        console.log(error);
    }

    return ch;
};
