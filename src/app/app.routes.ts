import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/foundation/pages/foundation-page.component')
      .then((m) => m.FoundationPageComponent),
    title: 'Planforge Overview',
  },
  {
    path: 'source',
    loadComponent: () => import('./features/source-intake/pages/source-intake-page.component')
      .then((m) => m.SourceIntakePageComponent),
    title: 'Planforge Program Setup',
  },
  {
    path: 'reporting',
    loadComponent: () => import('./features/reporting-baseline/pages/reporting-baseline-page.component')
      .then((m) => m.ReportingBaselinePageComponent),
    title: 'Planforge Reporting',
  },
  {
    path: 'geometry',
    loadComponent: () => import('./features/geometry-lot/pages/geometry-lot-page.component')
      .then((m) => m.GeometryLotPageComponent),
    title: 'Planforge Site And Lot',
  },
  {
    path: 'generation',
    loadComponent: () => import('./features/generation-seeds/pages/generation-seeds-page.component')
      .then((m) => m.GenerationSeedsPageComponent),
    title: 'Planforge Generation',
  },
  {
    path: 'simulation',
    loadComponent: () => import('./features/simulation-foundation/pages/simulation-foundation-page.component')
      .then((m) => m.SimulationFoundationPageComponent),
    title: 'Planforge Simulation',
  },
  {
    path: 'processing',
    loadComponent: () => import('./features/processing/pages/processing-page.component')
      .then((m) => m.ProcessingPageComponent),
    title: 'Planforge Processing',
  },
  {
    path: 'verification',
    loadComponent: () => import('./features/verification/pages/verification-page.component')
      .then((m) => m.VerificationPageComponent),
    title: 'Planforge Verification',
  },
  {
    path: 'construction',
    loadComponent: () => import('./features/construction/pages/construction-page.component')
      .then((m) => m.ConstructionPageComponent),
    title: 'Planforge Construction Output',
  },
  {
    path: 'gallery',
    loadComponent: () => import('./features/gallery/pages/gallery-page.component')
      .then((m) => m.GalleryPageComponent),
    title: 'Planforge Candidate Gallery',
  },
  {
    path: 'output-viewer',
    loadComponent: () => import('./features/output-viewer/pages/output-viewer-page.component')
      .then((m) => m.OutputViewerPageComponent),
    title: 'Planforge Output Viewer',
  },
];
