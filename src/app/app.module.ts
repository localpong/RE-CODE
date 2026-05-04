import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AppComponent } from './app.component';
import { OperatorTabletComponent } from './operator-tablet/component/operator-tablet/operator-tablet.component';
import { RobotStatusComponent } from './operator-tablet/component/robot-status/robot-status.component';
import { AiTerminalComponent } from './operator-tablet/component/terminal/ai-terminal.component';
import { WorldViewComponent } from './operator-tablet/component/operator-tablet/world-view.component';
import { AssistantTabletComponent } from './operator-tablet/component/assistant-tablet/assistant-tablet.component';

 

@NgModule({
  declarations: [
    AppComponent,
    OperatorTabletComponent,
    AssistantTabletComponent,
    RobotStatusComponent,
    AiTerminalComponent,
    WorldViewComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    CommonModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
