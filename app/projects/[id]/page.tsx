import { ProjectDetailView } from '@/components/project-detail-view'

export default async function ProjectPage({
    params
}: {
    params: Promise<{ id: string }>
}) {
    const { id  } = await params
    // prueba nuevo commit 
    return (
        <main>
            <ProjectDetailView projectId={id} />
        </main>
    )
}
