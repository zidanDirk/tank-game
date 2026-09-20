const MACOS_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function browserLaunchOptions({
  chromePath = process.env.CHROME_PATH ?? "",
  platform = process.platform,
} = {}) {
  const options = {
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  };

  if (chromePath) options.executablePath = chromePath;
  else if (platform === "darwin") options.executablePath = MACOS_CHROME;

  return options;
}
