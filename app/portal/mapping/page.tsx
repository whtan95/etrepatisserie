"use client"

import dynamic from "next/dynamic"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TeamMappingView = dynamic(
  () => import("@/components/portal/team-mapping/TeamMappingView"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    ),
  }
)

export default function MappingPage() {
  return (
    <div className="min-h-[600px]">
      <Tabs defaultValue="mapping" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="mapping">Mapping</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="mapping" className="mt-4">
          <TeamMappingView />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Report tab placeholder (to be implemented).
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
