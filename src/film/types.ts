/** Who says a line of a film when it isn't the narrator: the voice call's own lines. */
export type FilmSpeaker = 'interviewer' | 'caller';

export interface FilmSentence {
  text: string;
  start: number;
  speaker?: FilmSpeaker;
}

export interface FilmChapter {
  id: string;
  title: string;
  start: number;
  sentences: FilmSentence[];
}

/** One film on the site — written by scripts/film-data.mjs from the film's chapters.json. */
export interface FilmData {
  duration: number;
  src: string;
  poster: string;
  captions: string;
  chapters: FilmChapter[];
}
