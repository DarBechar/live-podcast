require 'webrick'

server = WEBrick::HTTPServer.new(
  :Port => 8080,
  :DocumentRoot => '/Users/elinorsamara/Documents/Claude Projects/Live_Podcast'
)

trap('INT') { server.shutdown }
server.start
