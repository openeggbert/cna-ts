// SPDX-License-Identifier: MS-PL

/**
 * The `Microsoft.Xna.Framework.GamerServices` identity enumerations.
 *
 * Every value is the exact number the XNA 4.0 reference assembly declares, because a game that
 * persists one of these -- a presence mode in a save file, a leaderboard key in a request -- is
 * persisting the number, not the name.
 */

/** A canned avatar animation shipped with the platform, loaded by `AvatarAnimation`. */
export enum AvatarAnimationPreset {
  Stand0 = 0,
  Stand1 = 1,
  Stand2 = 2,
  Stand3 = 3,
  Stand4 = 4,
  Stand5 = 5,
  Stand6 = 6,
  Stand7 = 7,
  Clap = 8,
  Wave = 9,
  Celebrate = 10,
  FemaleIdleCheckNails = 11,
  FemaleIdleLookAround = 12,
  FemaleIdleShiftWeight = 13,
  FemaleIdleFixShoe = 14,
  FemaleAngry = 15,
  FemaleConfused = 16,
  FemaleLaugh = 17,
  FemaleCry = 18,
  FemaleShocked = 19,
  FemaleYawn = 20,
  MaleIdleLookAround = 21,
  MaleIdleStretch = 22,
  MaleIdleShiftWeight = 23,
  MaleIdleCheckHand = 24,
  MaleAngry = 25,
  MaleConfused = 26,
  MaleLaugh = 27,
  MaleCry = 28,
  MaleSurprised = 29,
  MaleYawn = 30,
}

/** Whether an avatar description describes a male or female body. */
export enum AvatarBodyType {
  Female = 0,
  Male = 1,
}

/** One bone of the avatar skeleton. `AvatarRenderer.BoneCount` bone transforms are indexed by this. */
export enum AvatarBone {
  Root = 0,
  BackLower = 1,
  HipLeft = 2,
  HipRight = 3,
  BackUpper = 5,
  KneeLeft = 6,
  KneeRight = 8,
  AnkleLeft = 11,
  CollarLeft = 12,
  Neck = 14,
  AnkleRight = 15,
  CollarRight = 16,
  Head = 19,
  ShoulderLeft = 20,
  ToeLeft = 21,
  ShoulderRight = 22,
  ToeRight = 23,
  ElbowLeft = 25,
  ElbowRight = 28,
  WristLeft = 33,
  WristRight = 36,
  FingerIndexLeft = 37,
  FingerMiddleLeft = 38,
  FingerRingLeft = 39,
  FingerSmallLeft = 40,
  PropLeft = 41,
  SpecialLeft = 42,
  FingerThumbLeft = 43,
  FingerIndexRight = 44,
  FingerMiddleRight = 45,
  FingerRingRight = 46,
  FingerSmallRight = 47,
  PropRight = 48,
  SpecialRight = 49,
  FingerThumbRight = 50,
  FingerIndex2Left = 51,
  FingerMiddle2Left = 52,
  FingerRing2Left = 53,
  FingerSmall2Left = 54,
  FingerThumb2Left = 55,
  FingerIndex2Right = 56,
  FingerMiddle2Right = 57,
  FingerRing2Right = 58,
  FingerSmall2Right = 59,
  FingerThumb2Right = 60,
  FingerIndex3Left = 61,
  FingerMiddle3Left = 62,
  FingerRing3Left = 63,
  FingerSmall3Left = 64,
  FingerThumb3Left = 65,
  FingerIndex3Right = 66,
  FingerMiddle3Right = 67,
  FingerRing3Right = 68,
  FingerSmall3Right = 69,
  FingerThumb3Right = 70,
}

/** An avatar's eye expression. */
export enum AvatarEye {
  Neutral = 0,
  Sad = 1,
  Angry = 2,
  Confused = 3,
  Laughing = 4,
  Shocked = 5,
  Happy = 6,
  Yawning = 7,
  Sleeping = 8,
  LookUp = 9,
  LookDown = 10,
  LookLeft = 11,
  LookRight = 12,
  Blink = 13,
}

/** An avatar's eyebrow expression. */
export enum AvatarEyebrow {
  Neutral = 0,
  Sad = 1,
  Angry = 2,
  Confused = 3,
  Raised = 4,
}

/** An avatar's mouth expression, including the phonetic shapes used for lip synchronisation. */
export enum AvatarMouth {
  Neutral = 0,
  Sad = 1,
  Angry = 2,
  Confused = 3,
  Laughing = 4,
  Shocked = 5,
  Happy = 6,
  PhoneticO = 7,
  PhoneticAi = 8,
  PhoneticEe = 9,
  PhoneticFv = 10,
  PhoneticW = 11,
  PhoneticL = 12,
  PhoneticDth = 13,
}

/** Whether an `AvatarRenderer` has finished loading its avatar. */
export enum AvatarRendererState {
  Loading = 0,
  Ready = 1,
  Unavailable = 2,
}

/** A game-defaults controller sensitivity preference. */
export enum ControllerSensitivity {
  Low = 0,
  Medium = 1,
  High = 2,
}

/** A game-defaults difficulty preference. */
export enum GameDifficulty {
  Easy = 0,
  Normal = 1,
  Hard = 2,
}

/** The presence string a gamer's friends see. The platform owns the wording; a game chooses which of these fixed modes applies. */
export enum GamerPresenceMode {
  None = 0,
  SinglePlayer = 1,
  Multiplayer = 2,
  LocalCoOp = 3,
  LocalVersus = 4,
  OnlineCoOp = 5,
  OnlineVersus = 6,
  VersusComputer = 7,
  Stage = 8,
  Level = 9,
  CoOpStage = 10,
  CoOpLevel = 11,
  ArcadeMode = 12,
  CampaignMode = 13,
  ChallengeMode = 14,
  ExplorationMode = 15,
  PracticeMode = 16,
  PuzzleMode = 17,
  ScenarioMode = 18,
  StoryMode = 19,
  SurvivalMode = 20,
  TutorialMode = 21,
  DifficultyEasy = 22,
  DifficultyMedium = 23,
  DifficultyHard = 24,
  DifficultyExtreme = 25,
  Score = 26,
  VersusScore = 27,
  Winning = 28,
  Losing = 29,
  ScoreIsTied = 30,
  Outnumbered = 31,
  OnARoll = 32,
  InCombat = 33,
  BattlingBoss = 34,
  TimeAttack = 35,
  TryingForRecord = 36,
  FreePlay = 37,
  WastingTime = 38,
  StuckOnAHardBit = 39,
  NearlyFinished = 40,
  LookingForGames = 41,
  WaitingForPlayers = 42,
  WaitingInLobby = 43,
  SettingUpMatch = 44,
  PlayingWithFriends = 45,
  AtMenu = 46,
  StartingGame = 47,
  Paused = 48,
  GameOver = 49,
  WonTheGame = 50,
  ConfiguringSettings = 51,
  CustomizingPlayer = 52,
  EditingLevel = 53,
  InGameStore = 54,
  WatchingCutscene = 55,
  WatchingCredits = 56,
  PlayingMinigame = 57,
  FoundSecret = 58,
  CornflowerBlue = 59,
}

/** How widely a privilege is granted to a signed-in gamer. */
export enum GamerPrivilegeSetting {
  Blocked = 0,
  FriendsOnly = 1,
  Everyone = 2,
}

/** The gamer zone a profile belongs to. */
export enum GamerZone {
  Unknown = 0,
  Recreation = 1,
  Pro = 2,
  Family = 3,
  Underground = 4,
}

/** Which of the four platform leaderboards a reader or writer addresses. */
export enum LeaderboardKey {
  BestScoreLifeTime = 0,
  BestScoreRecent = 1,
  BestTimeLifeTime = 2,
  BestTimeRecent = 3,
}

/** The result a gamer recorded in a ranked session. */
export enum LeaderboardOutcome {
  None = 0,
  Win = 1,
  Loss = 2,
  Tie = 3,
}

/** The icon `Guide.BeginShowMessageBox` displays. */
export enum MessageBoxIcon {
  None = 0,
  Error = 1,
  Warning = 2,
  Alert = 3,
}

/** Where the platform draws its notification popups. */
export enum NotificationPosition {
  TopLeft = 0,
  TopCenter = 1,
  TopRight = 2,
  CenterLeft = 3,
  Center = 4,
  CenterRight = 5,
  BottomLeft = 6,
  BottomCenter = 7,
  BottomRight = 8,
}

/** A game-defaults racing camera preference. */
export enum RacingCameraAngle {
  Back = 0,
  Front = 1,
  Inside = 2,
}
