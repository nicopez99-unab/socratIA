'use client';

import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function StudentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      const body = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error(`El servidor devolvió una respuesta no válida (HTTP ${res.status}).`);
      }

      if (typeof data !== 'object' || data === null) {
        throw new Error('El servidor devolvió una respuesta no válida.');
      }

      const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
      if (!res.ok) {
        throw new Error(error ?? `Error del servidor (HTTP ${res.status}).`);
      }

      const content = 'content' in data && typeof data.content === 'string' ? data.content : undefined;
      if (!content) {
        throw new Error(error ?? 'El servidor no devolvió una respuesta. Intenta de nuevo.');
      }
      setMessages([...newMessages, { role: 'assistant', content }]);
    } catch (err) {
      console.error(err);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'No pude conectar con el servidor. Intenta de nuevo.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4 font-sans">
      <header className="border-b pb-3 mb-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">
          🤖 SocrátIA &amp; 🐶 Lupo
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded ml-2">
            Tutor Guiado
          </span>
        </h1>
      </header>

      <p className="mb-3 text-sm text-slate-600">
        Fuentes activas: agrega archivos PDF o TXT a la carpeta <strong>fuentes/</strong>.
      </p>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 my-10 p-6 bg-slate-50 rounded-lg border border-dashed">
            <p className="font-semibold text-slate-700">¡Hola! Para comenzar tu sesión:</p>
            <p className="text-sm mt-1">
              Ingresa la consigna de tu tarea junto con tu <strong>borrador o hipótesis inicial</strong>.
            </p>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-xl max-w-[85%] whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-blue-600 text-white ml-auto'
                : 'bg-slate-100 text-slate-800 border border-slate-200'
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="bg-slate-100 text-slate-500 p-3 rounded-xl max-w-[80%] animate-pulse">
            SocrátIA está evaluando tu avance...
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu hipótesis o duda..."
          className="flex-1 border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}