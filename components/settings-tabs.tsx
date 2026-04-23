"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface SettingsTabsProps {
  generalContent: ReactNode;
  securityContent: ReactNode;
  integrationsContent: ReactNode;
  complianceContent: ReactNode;
  showGeneral: boolean;
  showSecurity?: boolean;
  showIntegrations: boolean;
  showCompliance: boolean;
  labels: {
    general: string;
    security: string;
    integrations: string;
    compliance: string;
  };
}

export function SettingsTabs({
  generalContent,
  securityContent,
  integrationsContent,
  complianceContent,
  showGeneral,
  showSecurity,
  showIntegrations,
  showCompliance,
  labels,
}: SettingsTabsProps) {
  const isSecurityVisible = showSecurity !== false;
  const visibleTabCount = [showGeneral, isSecurityVisible, showIntegrations, showCompliance].filter(Boolean).length;
  const defaultTab = showGeneral
    ? "general"
    : isSecurityVisible
      ? "security"
      : showIntegrations
        ? "integrations"
        : "compliance";

  const gridColumnsClass =
    visibleTabCount === 1 ? "grid-cols-1"
    : visibleTabCount === 2 ? "grid-cols-2"
    : visibleTabCount === 3 ? "grid-cols-3"
    : "grid-cols-4";

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className={`grid w-full ${gridColumnsClass}`}>
        {showGeneral ? <TabsTrigger value="general">{labels.general}</TabsTrigger> : null}
        {isSecurityVisible ? <TabsTrigger value="security">{labels.security}</TabsTrigger> : null}
        {showIntegrations ? <TabsTrigger value="integrations">{labels.integrations}</TabsTrigger> : null}
        {showCompliance ? <TabsTrigger value="compliance">{labels.compliance}</TabsTrigger> : null}
      </TabsList>

      {showGeneral ? <TabsContent value="general" className="space-y-6">{generalContent}</TabsContent> : null}
      {isSecurityVisible ? <TabsContent value="security" className="space-y-6">{securityContent}</TabsContent> : null}
      {showIntegrations ? <TabsContent value="integrations" className="space-y-6">{integrationsContent}</TabsContent> : null}
      {showCompliance ? <TabsContent value="compliance" className="space-y-6">{complianceContent}</TabsContent> : null}
    </Tabs>
  );
}
