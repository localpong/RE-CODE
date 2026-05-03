import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { OperatorTabletComponent } from './operator-tablet.component';

describe('OperatorTabletComponent', () => {
  let component: OperatorTabletComponent;
  let fixture: ComponentFixture<OperatorTabletComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [OperatorTabletComponent],
      imports: [FormsModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OperatorTabletComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
