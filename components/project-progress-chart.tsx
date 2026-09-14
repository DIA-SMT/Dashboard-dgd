"use client"

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ProjectProgress {
    name: string
    completed: number
    remaining: number
    total: number
}

interface ProjectProgressChartProps {
    data: ProjectProgress[]
}

export function ProjectProgressChart({ data }: ProjectProgressChartProps) {
    return (
        <Card className="mb-8">
            <CardHeader>
                <CardTitle>Progreso de Proyectos</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            layout="horizontal"
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend />
                            <Bar dataKey="completed" name="Completadas" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="remaining" name="Pendientes" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
