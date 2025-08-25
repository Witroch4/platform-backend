"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, Brain, Cpu, Users, Plus, Search, Filter } from "lucide-react";
import { FeatureFlagCard } from "./FeatureFlagCard";
import { UserFlagOverrideDialog } from "./UserFlagOverrideDialog";
import { FeatureFlagMetricsDashboard } from "./FeatureFlagMetricsDashboard";

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  rolloutPercentage: number;
  userSpecific: boolean;
  systemCritical: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  metrics?: any[];
  userOverrides?: any[];
}

interface FeatureFlagCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  flags: FeatureFlag[];
}

interface FeatureFlagCategoryTabsProps {
  categories: FeatureFlagCategory[];
  onToggleFlag: (flagId: string, enabled: boolean) => Promise<void>;
  onDeleteFlag?: (flagId: string) => Promise<void>;
  onCreateFlag?: () => void;
  updating?: string | null;
}

export function FeatureFlagCategoryTabs({
  categories,
  onToggleFlag,
  onDeleteFlag,
  onCreateFlag,
  updating
}: FeatureFlagCategoryTabsProps) {
  const [activeTab, setActiveTab] = useState(categories[0]?.id || "system");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<boolean | null>(null);

  const filterFlags = (flags: FeatureFlag[]) => {
    return flags.filter(flag => {
      const matchesSearch = 
        flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        flag.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filterEnabled === null || flag.enabled === filterEnabled;
      
      return matchesSearch && matchesFilter;
    });
  };

  const getFilteredCategories = () => {
    return categories.map(category => ({
      ...category,
      flags: filterFlags(category.flags)
    }));
  };

  const filteredCategories = getFilteredCategories();
  const totalFlags = categories.reduce((sum, cat) => sum + cat.flags.length, 0);
  const activeFlags = categories.reduce((sum, cat) => sum + cat.flags.filter(f => f.enabled).length, 0);

  return (
    <div className="space-y-6">
      {/* Header with Stats and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Feature Flags por Categoria</h2>
            <p className="text-muted-foreground">
              {totalFlags} flags total, {activeFlags} ativas
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{totalFlags} Total</Badge>
            <Badge variant="default">{activeFlags} Ativas</Badge>
            <Badge variant="secondary">{totalFlags - activeFlags} Inativas</Badge>
          </div>
        </div>
        
        {onCreateFlag && (
          <Button onClick={onCreateFlag} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nova Flag
          </Button>
        )}
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar feature flags por nome ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Button
                variant={filterEnabled === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterEnabled(null)}
              >
                Todas
              </Button>
              <Button
                variant={filterEnabled === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterEnabled(true)}
              >
                Ativas
              </Button>
              <Button
                variant={filterEnabled === false ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterEnabled(false)}
              >
                Inativas
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          {categories.map((category) => {
            const filteredCount = filteredCategories.find(c => c.id === category.id)?.flags.length || 0;
            return (
              <TabsTrigger 
                key={category.id} 
                value={category.id} 
                className="flex items-center gap-2"
              >
                <category.icon className="h-4 w-4" />
                {category.name}
                {filteredCount !== category.flags.length && (
                  <Badge variant="secondary" className="ml-1">
                    {filteredCount}/{category.flags.length}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {filteredCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <category.icon className="h-5 w-5" />
                  {category.name}
                </CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {category.flags.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm || filterEnabled !== null 
                      ? "Nenhuma feature flag encontrada com os filtros aplicados"
                      : "Nenhuma feature flag encontrada nesta categoria"
                    }
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {category.flags.map((flag) => (
                      <FeatureFlagCard
                        key={flag.id}
                        flag={flag}
                        onToggle={onToggleFlag}
                        onDelete={onDeleteFlag}
                        onUserOverrides={(flagId) => {
                          // This will be handled by the UserFlagOverrideDialog
                        }}
                        onMetrics={(flagId) => {
                          // This will be handled by the FeatureFlagMetricsDashboard
                        }}
                        updating={updating === flag.id}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Hidden dialogs for user overrides and metrics */}
      {categories.flatMap(cat => cat.flags).map((flag) => (
        <div key={`dialogs-${flag.id}`} className="hidden">
          <UserFlagOverrideDialog
            flagId={flag.id}
            flagName={flag.name}
          >
            <div />
          </UserFlagOverrideDialog>
          
          <FeatureFlagMetricsDashboard
            flagId={flag.id}
            flagName={flag.name}
          >
            <div />
          </FeatureFlagMetricsDashboard>
        </div>
      ))}
    </div>
  );
}