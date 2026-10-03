args <- commandArgs(TRUE)

# Put the path containing the C compiler on the PATH.
Sys.setenv(PATH = paste(dirname(args[1]), Sys.getenv("PATH"), sep = ";"))

# Find destination directory (default to R.home("bin"))
outDir <- if (length(args) >= 2 && nzchar(args[2])) args[2] else R.home("bin")

# Find R DLLs.
dlls <- list.files(R.home("bin"), pattern = "dll$", full.names = TRUE)

message("Generating .lib files for DLLs in ", R.home("bin"), " into ", outDir)

# Generate corresponding 'lib' file for each DLL.
for (dll in dlls) {
   baseName <- sub("\\.[^.]+$", "", basename(dll))
   def <- file.path(outDir, paste0(baseName, ".def"))
   outfile <- file.path(outDir, paste0(baseName, ".lib"))

   # check to see if we've already generated our exports
   if (file.exists(outfile))
      next
   
   # Call it on R.dll to generate exports.
   command <- sprintf('dumpbin.exe /EXPORTS /NOLOGO "%s"', dll)
   message("> ", command)
   output <- system(command, intern = TRUE)
   
   # Remove synonyms.
   output <- sub("=.*$", "", output)
   
   # Find start, end markers
   start <- grep("ordinal\\s+hint\\s+RVA\\s+name", output)
   end <- grep("^\\s*Summary\\s*$", output)
   if (length(start) == 0 || length(end) == 0)
      next
   contents <- output[start:(end - 1)]
   contents <- contents[nzchar(contents)]
   
   # Remove forwarded fields
   contents <- grep("forwarded to", contents, invert = TRUE, value = TRUE, fixed = TRUE)
   
   # parse into a table
   tbl <- read.table(text = contents, header = TRUE, stringsAsFactors = FALSE)
   exports <- tbl$name
   
   # sort and re-format exports
   exports <- sort(exports)
   exports <- c("EXPORTS", paste("\t", exports, sep = ""))
   
   # Write the exports to a def file
   cat(exports, file = def, sep = "\n")
   
   # Call 'lib.exe' to generate the library file.
   fmt <- 'lib.exe /def:"%s" /out:"%s" /machine:%s'
   cmd <- sprintf(fmt, def, outfile, .Platform$r_arch)
   system(cmd)
   
}
