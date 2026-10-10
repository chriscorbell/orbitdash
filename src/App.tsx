import { Fragment } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ServicesSection } from "@/components/ServicesSection";
import { StatsSection } from "@/components/StatsSection";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useDashboardSettings } from "@/hooks/useDashboardSettings";
import { useServices } from "@/hooks/useServices";

function App() {
  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    create,
    update,
    duplicate,
    remove,
    renameCategory,
    reload,
  } = useServices();
  const categoryOrder = useCategoryOrder(services);
  const {
    error: settingsError,
    scope: settingsScope,
    settings,
    setScope: setSettingsScope,
    updateLayout,
  } = useDashboardSettings();
  const {
    gridColumns: columnCount,
    servicesFirst,
    showServices: showServicesSection,
    showStats: showStatsSection,
  } = settings.layout;
  const statsSection = <StatsSection />;

  const servicesSection = (
    <ServicesSection
      services={services}
      categoryOrder={categoryOrder}
      loading={servicesLoading}
      error={servicesError}
      columnCount={columnCount}
      onRetry={reload}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      onDuplicate={duplicate}
      onRenameCategory={renameCategory}
    />
  );

  const orderedSections = servicesFirst
    ? [
        { key: "services", visible: showServicesSection, content: servicesSection },
        { key: "stats", visible: showStatsSection, content: statsSection },
      ]
    : [
        { key: "stats", visible: showStatsSection, content: statsSection },
        { key: "services", visible: showServicesSection, content: servicesSection },
      ];

  const visibleSections = orderedSections.filter((section) => section.visible);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header
        categoryOrder={categoryOrder}
        columnCount={columnCount}
        servicesFirst={servicesFirst}
        settingsError={settingsError}
        settingsScope={settingsScope}
        showServicesSection={showServicesSection}
        showStatsSection={showStatsSection}
        onColumnCountChange={(gridColumns) => updateLayout({ gridColumns })}
        onServicesFirstChange={(servicesFirst) => updateLayout({ servicesFirst })}
        onSettingsScopeChange={setSettingsScope}
        onShowServicesSectionChange={(showServices) => updateLayout({ showServices })}
        onShowStatsSectionChange={(showStats) => updateLayout({ showStats })}
      />
      <main className="page-load mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {visibleSections.length === 0 ? (
          <Card size="sm" className="border-dashed">
            <CardContent className="space-y-1 py-1">
              <CardTitle className="text-sm font-semibold">Nothing is visible</CardTitle>
              <CardDescription>
                Turn on the Stats section or Services section in Settings to show dashboard content.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          visibleSections.map((section, index) => (
            <Fragment key={section.key}>
              {index > 0 && <Separator />}
              {section.content}
            </Fragment>
          ))
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
