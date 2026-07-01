import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimulationControlBarComponent } from './simulation-control-bar.component';

describe('SimulationControlBarComponent', () => {
  let fixture: ComponentFixture<SimulationControlBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationControlBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SimulationControlBarComponent);
    fixture.componentRef.setInput('metrics', [
      { label: 'Instances', value: '1 / 1' },
      { label: 'Simulation', value: 'paused' },
    ]);
    fixture.componentRef.setInput('isRunning', false);
    fixture.detectChanges();
  });

  it('emits start when the primary action is clicked while paused', () => {
    const startSpy = vi.fn();
    fixture.componentInstance.startRequested.subscribe(startSpy);

    const primaryButton = fixture.nativeElement.querySelector('.simulation-bar__btn--primary') as HTMLButtonElement;
    primaryButton.click();

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('emits stop and clear actions from the secondary controls', () => {
    const stopSpy = vi.fn();
    const clearSpy = vi.fn();
    fixture.componentRef.setInput('isRunning', true);
    fixture.detectChanges();

    fixture.componentInstance.stopRequested.subscribe(stopSpy);
    fixture.componentInstance.clearRequested.subscribe(clearSpy);

    const buttons = fixture.nativeElement.querySelectorAll('.simulation-bar__btn') as NodeListOf<HTMLButtonElement>;
    buttons[1].click();
    buttons[2].click();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
