import { MarkdownView, ObsidianProtocolData, Plugin } from "obsidian";

import DatePickerModal from "./modals/date-picker";
import NLDParser, { NLDResult } from "./parser";
import { NLDSettingsTab, NLDSettings, DEFAULT_SETTINGS } from "./settings";
import DateSuggest from "./suggest/date-suggest";
import {
  getParseCommand,
  getCurrentDateCommand,
  getCurrentTimeCommand,
  getNowCommand,
} from "./commands";
import { getFormattedDate, getOrCreateDailyNote, parseTruthy } from "./utils";

export default class NaturalLanguageDates extends Plugin {
  private parser: NLDParser;
  public settings: NLDSettings;

  async onload(): Promise<void> {
    console.log("Loading natural language date parser plugin");
    await this.loadSettings();

    this.addCommand({
      id: "nlp-dates",
      name: "Parse natural language date",
      callback: () => getParseCommand(this, "replace"),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-dates-link",
      name: "Parse natural language date (as link)",
      callback: () => getParseCommand(this, "link"),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-date-clean",
      name: "Parse natural language date (as plain text)",
      callback: () => getParseCommand(this, "clean"),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-parse-time",
      name: "Parse natural language time",
      callback: () => getParseCommand(this, "time"),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-now",
      name: "Insert the current date and time",
      callback: () => getNowCommand(this),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-now-utc",
      name: "Insert the current date and time in UTC",
      callback: () => this.getNowUTCCommand(),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-today",
      name: "Insert the current date",
      callback: () => getCurrentDateCommand(this),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-time",
      name: "Insert the current time",
      callback: () => getCurrentTimeCommand(this),
      hotkeys: [],
    });

    this.addCommand({
      id: "nlp-picker",
      name: "Date picker",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return !!this.app.workspace.getActiveViewOfType(MarkdownView);
        }
        new DatePickerModal(this.app, this).open();
      },
      hotkeys: [],
    });

    this.addSettingTab(new NLDSettingsTab(this.app, this));
    this.registerObsidianProtocolHandler("nldates", this.actionHandler.bind(this));
    this.registerEditorSuggest(new DateSuggest(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      // initialize the parser when layout is ready so that the correct locale is used
      this.parser = new NLDParser();
    });
  }

  onunload(): void {
    console.log("Unloading natural language date parser plugin");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /*
    @param dateString: A string that contains a date in natural language, e.g. today, tomorrow, next week
    @param format: A string that contains the formatting string for a Moment
    @returns NLDResult: An object containing the date, a cloned Moment and the formatted string.
  */
  parse(dateString: string, format: string): NLDResult {
    const date = this.parser.getParsedDate(dateString, this.settings.weekStart);
    const formattedString = getFormattedDate(date, format);
    if (formattedString === "Invalid date") {
      console.debug("Input date " + dateString + " can't be parsed by nldates");
    }

    return {
      formattedString,
      date,
      moment: window.moment(date),
    };
  }

  getMoment(date: Date): any {
    return (window as any).moment(date);
  }

  getUTCMoment(date: Date): any {
    return (window as any).moment.utc(date);
  }

  getFormattedDate(date: Date): string {
    var formattedDate = this.getMoment(date).format(this.settings.format);
    return formattedDate;
  }

  getFormattedTime(date: Date): string {
    var formattedTime = this.getMoment(date).format(this.settings.timeFormat);
    return formattedTime;
  }

  /*
    @param dateString: A string that contains a date in natural language, e.g. today, tomorrow, next week
    @returns NLDResult: An object containing the date, a cloned Moment and the formatted string.
  */
  parseDate(dateString: string): NLDResult {
    return this.parse(dateString, this.settings.format);
  }

  parseTime(dateString: string): NLDResult {
    return this.parse(dateString, this.settings.timeFormat);
  }

  async actionHandler(params: ObsidianProtocolData): Promise<void> {
    const { workspace } = this.app;

  onTrigger(mode: string) {
    let activeLeaf: any = this.app.workspace.activeLeaf;
    let editor = activeLeaf.view.sourceMode.cmEditor;
    var cursor = editor.getCursor();
    var selectedText = this.getSelectedText(editor);

    let date = this.parseDate(selectedText);

    if (!date.moment.isValid()) {
      editor.setCursor({
        line: cursor.line,
        ch: cursor.ch
      });
    } else {
      //mode == "replace"
      var newStr = `[[${date.formattedString}]]`;

      if (mode == "link") {
        newStr = `[${selectedText}](${date.formattedString})`;
      } else if (mode == "clean") {
        newStr = `${date.formattedString}`;
      } else if (mode == "time") {
        let time = this.parseTime(selectedText);

        newStr = `${time.formattedString}`;
      }

      editor.replaceSelection(newStr);
      this.adjustCursor(editor, cursor, newStr, selectedText);
      editor.focus();
    }
  }

  adjustCursor(editor: any, cursor: any, newStr: string, oldStr: string) {
    var cursorOffset = newStr.length - oldStr.length;
    editor.setCursor({
      line: cursor.line,
      ch: cursor.ch + cursorOffset
    });
  }

  getNowCommand() {
    let activeLeaf: any = this.app.workspace.activeLeaf;
    let editor = activeLeaf.view.sourceMode.cmEditor;
    editor.replaceSelection(
      this.getMoment(new Date()).format(
        `${this.settings.format}${this.settings.separator}${this.settings.timeFormat}`
      )
    );
  }

  getNowUTCCommand() {
    let activeLeaf: any = this.app.workspace.activeLeaf;
    let editor = activeLeaf.view.sourceMode.cmEditor;
    editor.replaceSelection(
      this.getUTCMoment(new Date()).format(
        `${this.settings.format}${this.settings.separator}${this.settings.timeFormat}`
      )
    );
  }

  getDateCommand() {
    let activeLeaf: any = this.app.workspace.activeLeaf;
    let editor = activeLeaf.view.sourceMode.cmEditor;
    editor.replaceSelection(
      this.getMoment(new Date()).format(this.settings.format)
    );
  }

  getTimeCommand() {
    let activeLeaf: any = this.app.workspace.activeLeaf;
    let editor = activeLeaf.view.sourceMode.cmEditor;
    editor.replaceSelection(
      this.getMoment(new Date()).format(this.settings.timeFormat)
    );
  }

  insertDateString(dateString: string, editor: any, cursor: any) {
    editor.replaceSelection(dateString);
  }

  getDateRange() {}

  async actionHandler(params: any) {

    let date = this.parseDate(params.day);
    let newPane = this.parseTruthy(params.newPane || "yes");

    console.log(date);
    const {
      workspace
    } = this.app;

    if (date.moment.isValid()) {
      const dailyNote = await getOrCreateDailyNote(date.moment);

      let leaf = workspace.activeLeaf;
      if (newPane) {
        leaf = workspace.splitActiveLeaf();
      }

      await leaf.openFile(dailyNote);

      workspace.setActiveLeaf(leaf);
    }
  }
}
