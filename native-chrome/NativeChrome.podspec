require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'NativeChrome'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://snkrfeature.com'
  s.author = 'sneakerfeature'
  s.source = { :git => 'https://snkrfeature.com', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
