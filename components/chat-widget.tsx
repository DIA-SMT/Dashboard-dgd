'use client'

import { useChat } from '@ai-sdk/react'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageCircle, X, Send, Loader2, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const { messages, sendMessage, status } = useChat()

    const isLoading = status === 'submitted' || status === 'streaming'
    const isDisabled = isLoading || isSubmitting
    const scrollAreaRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
        }
    }, [messages, isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isDisabled) return
        if (!input.trim()) return

        const textToSend = input
        setIsSubmitting(true)
        try {
            // AI SDK v5: enviar como `text` (UI message) para mantener `parts` consistente
            await sendMessage({ text: textToSend })
            setInput('')
        } finally {
            setIsSubmitting(false)
        }
    }

    const getMessageText = (m: any) => {
        // Compatibilidad: si viene con `content` (v4/viejo), úsalo.
        if (typeof m?.content === 'string') return m.content
        // Formato v5: `parts`
        if (Array.isArray(m?.parts)) {
            return m.parts
                .filter((p: any) => p?.type === 'text' && typeof p?.text === 'string')
                .map((p: any) => p.text)
                .join('')
        }
        return ''
    }

    const hasAnyText = (m: any) => {
        const t = getMessageText(m)
        return typeof t === 'string' && t.trim().length > 0
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
            {isOpen && (
                <Card className="w-[350px] md:w-[400px] h-[500px] shadow-xl border-slate-200 animate-in slide-in-from-bottom-2 duration-300">
                    <CardHeader className="p-4 border-b bg-slate-50 rounded-t-xl flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                            <Bot className="h-5 w-5 text-blue-600" />
                            <CardTitle className="text-sm font-medium">Asistente Virtual</CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={() => setIsOpen(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-hidden relative h-[380px]">
                        <div ref={scrollAreaRef} className="h-full overflow-y-auto p-4 space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center text-slate-500 mt-20 text-sm px-8">
                                    Hola, soy tu asistente de proyectos. <br />
                                    Prueba preguntarme: <br />
                                    <span className="font-semibold text-slate-700">"¿Qué proyectos tengo pendientes?"</span>
                                </div>
                            )}
                            {messages.map(m => (
                                <div key={m.id} className={cn(
                                    "flex w-full",
                                    m.role === 'user' ? "justify-end" : "justify-start"
                                )}>
                                    <div className={cn(
                                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                                        m.role === 'user'
                                            ? "bg-blue-600 text-white rounded-tr-none shadow-sm"
                                            : "bg-slate-100 text-slate-900 rounded-tl-none"
                                    )}>
                                        {hasAnyText(m) ? getMessageText(m) : (m.role === 'assistant' ? '…' : '')}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 rounded-2xl rounded-tl-none px-3 py-2 text-sm flex items-center gap-2">
                                        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                        <span className="text-slate-400 text-xs">Pensando...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="p-3 border-t bg-white">
                        <form onSubmit={handleSubmit} className="flex w-full gap-2">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Escribe tu consulta..."
                                className="flex-1"
                                disabled={isDisabled}
                            />
                            <Button type="submit" size="icon" disabled={isDisabled || !input.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </CardFooter>
                </Card>
            )}

            <Button
                onClick={() => setIsOpen(!isOpen)}
                size="lg"
                className="h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white transition-transform hover:scale-105"
            >
                {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
            </Button>
        </div>
    )
}
