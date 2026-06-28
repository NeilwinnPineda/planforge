import { Routes } from '@angular/router';
import { FoundationPageComponent } from './features/foundation/pages/foundation-page.component';
import { GalleryPageComponent } from './features/gallery/pages/gallery-page.component';
import { GenerationSeedsPageComponent } from './features/generation-seeds/pages/generation-seeds-page.component';
import { ProcessingPageComponent } from './features/processing/pages/processing-page.component';
import { SimulationFoundationPageComponent } from './features/simulation-foundation/pages/simulation-foundation-page.component';
import { SourceIntakePageComponent } from './features/source-intake/pages/source-intake-page.component';
import { ReportingBaselinePageComponent } from './features/reporting-baseline/pages/reporting-baseline-page.component';
import { GeometryLotPageComponent } from './features/geometry-lot/pages/geometry-lot-page.component';
import { VerificationPageComponent } from './features/verification/pages/verification-page.component';
import { ConstructionPageComponent } from './features/construction/pages/construction-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    component: FoundationPageComponent,
    title: 'App Next Foundation',
  },
  {
    path: 'source',
    component: SourceIntakePageComponent,
    title: 'App Next Source Intake',
  },
  {
    path: 'reporting',
    component: ReportingBaselinePageComponent,
    title: 'App Next Reporting Baseline',
  },
  {
    path: 'geometry',
    component: GeometryLotPageComponent,
    title: 'App Next Lot Geometry',
  },
  {
    path: 'generation',
    component: GenerationSeedsPageComponent,
    title: 'App Next Deterministic Generation',
  },
  {
    path: 'simulation',
    component: SimulationFoundationPageComponent,
    title: 'App Next Simulation Engine Foundation',
  },
  {
    path: 'processing',
    component: ProcessingPageComponent,
    title: 'App Next Layout Processing',
  },
  {
    path: 'verification',
    component: VerificationPageComponent,
    title: 'App Next Layout Verification',
  },
  {
    path: 'construction',
    component: ConstructionPageComponent,
    title: 'App Next Construction Handoff',
  },
  {
    path: 'gallery',
    component: GalleryPageComponent,
    title: 'App Next Layout Gallery',
  },
];
